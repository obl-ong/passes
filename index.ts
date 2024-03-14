import { createPass } from "passkit-generator";
import express from "express";
import fs from "fs"
import session from 'express-session';
import fetch from 'node-fetch'
import nunjucks from 'nunjucks'
import Sfs from 'session-file-store'
import shajs from 'sha.js'
import bodyParser from 'body-parser'
import { GoogleAuth } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import * as Sentry from "@sentry/bun";

const sfs = Sfs(session)

const app = express();
const port = 3000;

declare module 'express-session' {
	export interface SessionData {
		user: { [key: string]: any };
	}
}

if (process.env.SENTRY_DSN) {
	console.log("Sentry loaded")
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		integrations: [
			new Sentry.Integrations.Http({ tracing: true }),
			new Sentry.Integrations.Express({ app }),
		],
		tracesSampleRate: 1.0,
	});
}
app.use((req: any, res: any, next: any) => {
	res.set("Access-Control-Allow-Headers", "sentry-trace, baggage")
	next()
})
app.use(bodyParser.urlencoded({ extended: true }));
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
const issuerId = '3388000000022317765';

// TODO: Define Class ID
const classId = `${issuerId}.oblong_membership`;

const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1';

const credentials = require("./certs/sa.json");

const httpClient = new GoogleAuth({
	credentials: credentials,
	scopes: 'https://www.googleapis.com/auth/wallet_object.issuer'
});

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
	Sentry.startSpan({ name: "Generate Apple Wallet Pass" }, async (span) => {
		if (!req.session.user) return res.redirect("/auth")
		const user = req.session.user
		const id = Math.random().toString(32).slice(2)

		fs.cpSync("./membership.pass", `/tmp/${id}.pass`, { recursive: true })
		fs.writeFileSync(`/tmp/${id}.pass/pass.json`, JSON.stringify({
			"barcode": { "format": "PKBarcodeFormatQR" },
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
					{ "value": user.sub.toString(), "label": "ID", "key": "memberid" }
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
			Sentry.captureException(err)
			res.send("An error happened. Try again or nag David.")
		}
	})
});

// google wallet insanity follows
async function createPassClass(req: any, res: any) {
	// TODO: Create a Generic pass class
	let genericClass = {
		"id": classId,
		"classTemplateInfo": {
			"cardTemplateOverride": {
				"cardRowTemplateInfos": [
					{
						"twoItems": {
							"startItem": {
								"firstValue": {
									"fields": [
										{
											"fieldPath": "object.textModulesData['member_id']"
										}
									]
								}
							},
							"endItem": {
								"firstValue": {
									"fields": [
										{
											"fieldPath": "object.textModulesData['role']"
										}
									]
								}
							}
						}
					}
				]
			}
		}
	};

	let response;
	try {
		response = await httpClient.request({
			url: `${baseUrl}/genericClass/${classId}`,
			method: 'GET'
		});

		console.log('Class already exists');
		console.log(response);
	} catch (err: any) {
		Sentry.captureException(err)
		if (err.response && err.response.status === 404) {

			response = await httpClient.request({
				url: `${baseUrl}/genericClass`,
				method: 'POST',
				data: genericClass
			});

			console.log('Class insert response');
			console.log(response);
		} else {
			console.log(err);
			res.send('Something went wrong...check the console logs!');
		}
	}
}

async function createPassObject(req: any, res: any) {
	if (!req.session.user) return res.write("Failed.")
	const user = req.session.user
	// TODO: Create a new Generic pass for the user
	let objectSuffix = `suffix`;
	let objectId = `${issuerId}.${objectSuffix}`;

	let genericObject = {
		"id": objectId,
		"classId": classId,
		"logo": {
			"sourceUri": {
				"uri": "https://avatars.githubusercontent.com/u/117489383?s=200&v=4"
			},
			"contentDescription": {
				"defaultValue": {
					"language": "en-US",
					"value": "obl.ong oval logo"
				}
			}
		},
		"cardTitle": {
			"defaultValue": {
				"language": "en-US",
				"value": "Obl.ong Membership"
			}
		},
		"subheader": {
			"defaultValue": {
				"language": "en-US",
				"value": "Member Name"
			}
		},
		"header": {
			"defaultValue": {
				"language": "en-US",
				"value": user.name
			}
		},
		"textModulesData": [
			{
				"id": "member_id",
				"header": "Member ID",
				"body": user.sub
			},
			{
				"id": "role",
				"header": "Role",
				"body": "Member"
			}
		],
		"barcode": {
			"type": "QR_CODE",
			"value": user.sub.toString(),
			"alternateText": ""
		},
		"hexBackgroundColor": "#343434"
	};

	// TODO: Create the signed JWT and link
	const claims = {
		iss: credentials.client_email,
		aud: 'google',
		origins: [],
		typ: 'savetowallet',
		payload: {
			genericObjects: [
				genericObject
			]
		}
	};

	const token = jwt.sign(claims, credentials.private_key, { algorithm: 'RS256' });
	const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

	res.send(`<a href='${saveUrl}'><img src='wallet-button.png'></a>`);
}

app.post('/generate/google', async (req, res) => {
	Sentry.startSpan({ name: "Generate Google Wallet Pass" }, async (span) => {

		try {


			await createPassClass(req, res);
			await createPassObject(req, res);

		} catch (e) {
			Sentry.captureException(e)
		}
	});
});


app.use(function onError(err: any, req: any, res: any, next: Function) {
	res.send("An error occured. This has been reported. No need to worry!")
});

app.listen(port, () => {
	console.log(`Listening on port ${port}...`);
});
