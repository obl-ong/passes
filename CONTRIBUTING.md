# Contributing to Obl.ong

First of all, thank you for wanting to contribute to Obl.ong passes! Everyone is welcome to help and encouraged to help.

## 📜 Code of Conduct

Obl.ong is governed by the [Code of Conduct](https://github.com/obl-ong/code-of-conduct). You are expected to follow it. Basically, treat other humans with respect and don't discriminate based on any characteristic. You can report any violation to team@obl.ong, and we will take care of it ASAP.

## 🪳 Bug Reporting

Bug Reports are vital to development. You can report bugs using GitHub issues. However, we need information to help squash the bug. Basically:

- Ensure you are using the latest commit or version of Obl.ong passes.
- Make sure the issue hasn't already been posted by searching the issues.
- Give information about the bug: OS, OS version, Browser Version (if it occured in the browser), bun version (`bun -v`), git commit (`git rev-parse --short HEAD`), screenshot (if needed).

Also, please do **not** submit security issues via GitHub issues. Please send an E-mail to passes@obl.ong.

## 💻 Setting up a development environment

1. Install [bun.sh](https://bun.sh). You can do this by running `curl -fsSL https://bun.sh/install | bash`
2. Install the modules by running `bun install`
3. Set the following environment variables in the `.env` file:
   ```env
   CLIENT_ID=OBLONG_CLIENT_ID
   CLIENT_SECRET=OBLONG_CLIENT_SECRET
   SIGNING_SECRET=put_random_letters_here
   SENTRY_DSN=SENTRY_DSN
   ```
   You can remove the Sentry DSN from the ENV. It will automatically disable Sentry.

## 👗 Code Styling & Formatting
We use [Prettier](https://prettier.io/) to lint and format code. Please run it on changes you make. It keeps the code human-readable and improves code quality.


## ❓ Questions and Comments
If you need help with anything, we have a [forum](https://forum.obl.ong) to help you with anything and everything in regards to Obl.ong.