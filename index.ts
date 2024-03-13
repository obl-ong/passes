import { createPass } from "passkit-generator";
import express from "express";
import fs from "fs"
import session from 'express-session';
import fetch from 'node-fetch'
import nunjucks from 'nunjucks'
import Sfs from 'session-file-store'
import shajs from 'sha.js'

const sfs = Sfs(session)

const app = express();
const port = 3000;

declare module 'express-session' {
	export interface SessionData {
		user: { [key: string]: any };
	}
}

nunjucks.configure('views', {
	autoescape: true,
	express: app,
	noCache: true
});
app.use(express.static("public"))
app.use(session({
	secret: process.env.SIGNING_SECRET || Math.random().toString(32).slice(2),
	store: new sfs({}),
	resave: false,
	saveUninitialized: true,
	cookie: { secure: false }
}));

app.get("/", (req, res) => {
	res.render("index.njk")
});

app.get("/fail", (req, res) => {
	res.send("failed")
});
app.get('/auth', async (req, res) => {
	res.redirect("https://admin.obl.ong/oauth/authorize?" + new URLSearchParams({

		client_id: process.env.CLIENT_ID || " ",
		redirect_uri: "https://pass.obl.ong/auth/callback",
		scope: "openid name admin user",
		response_type: "code",
		response_mode: "query",
		state: Math.random().toString(32).slice(2)
	}).toString())
})
app.get('/auth/callback', async (req, res) => {
	const { code } = req.query
	if (!code) return res.redirect("/auth")
	const json: any = await (await fetch("https://admin.obl.ong/oauth/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: code.toString(),
			client_id: process.env.CLIENT_ID || " ",
			client_secret: process.env.CLIENT_SECRET || "",
			redirect_uri: "https://pass.obl.ong/auth/callback",
		}).toString()
	})).json();

	if (!json.access_token) return res.send("An error occured. Please nag david.").status(500)
	const token = json.access_token

	const user: any = await (await fetch("https://admin.obl.ong/oauth/userinfo", {
		headers: {
			Authorization: `Bearer ${token}`
		}
	})).json()

	req.session.user = user
	req.session.save()

	res.redirect("/pass")
});



app.get("/", (req, res) => {
	res.render("index.njk")
});
app.get("/pass", (req, res) => {
	if (!req.session.user) return res.redirect("/auth")
	const user = req.session.user
	res.render("pass.njk", { user })
});

app.get("/generate/pkpass", async (req, res) => {
	if (!req.session.user) return res.redirect("/auth")
	const user = req.session.user
	const id = Math.random().toString(32).slice(2)

	fs.cpSync("./membership.pass", `/tmp/${id}.pass`, { recursive: true })
	console.log(`/tmp/${id}`)
	fs.writeFileSync(`/tmp/${id}.pass/pass.json`, JSON.stringify({
		"barcode": { "format": "PKBarcodeFormatSquare" },
		"organizationName": "obl.ong",
		"teamIdentifier": "U3D876D8V5",
		"passTypeIdentifier": "pass.ong.obl.membership",
		"description": "obl.ong memership card",
		"foregroundColor": "rgb(37,37,37)",
		"backgroundColor": "rgb(255,32,110)",
		"secondary-auxiliary": [],
		"formatVersion": 1,
		"generic": {
			"headerFields": [
				{ "label": "Status", "value": "Member", "key": "userstatus" },
				{ "value": user.sub, "label": "Member ID", "key": "memberid" }
			],
			"primaryFields": [
				{ "value": user.name, "label": "Name", "key": "membername" }
			]
		}
	}

	))
	try {
		const pass = await createPass({
			model: `/tmp/${id}`,
			certificates: {
				wwdr: "./certs/wwdr.pem",
				signerCert: "./certs/signerCert.pem",
				signerKey: {
					keyFile: "./certs/signerKey.pem",
					passphrase: "ovals"
				}
			},
			overrides: {
				serialNumber: shajs('sha256').update(user.sub).digest('hex')
			}
		});


		pass.barcodes({ message: shajs('sha256').update(user.sub).digest('hex'), format: "PKBarcodeFormatCode128" })
		const stream = pass.generate()
		res.set({
			"Content-type": "application/vnd.apple.pkpass",
			"Content-disposition": `attachment; filename=oblong.pkpass`,
		});
		stream.pipe(res)
	} catch (err) {
		console.error(err)
		res.send("An error happened. Try again or nag David.")
	}
});
app.listen(port, () => {
	console.log(`Listening on port ${port}...`);
});