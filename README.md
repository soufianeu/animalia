# ANIMALIA Landing + Orders Dashboard

This project now includes:
- A public landing page with order form: `index.html`
- An admin dashboard to view/update orders: `admin.html`
- A low-cost AWS backend (API Gateway + Lambda + DynamoDB): `aws/`

## Project Structure

```text
animalia-main/
|-- index.html
|-- admin.html
|-- style.css
|-- admin.css
|-- admin.js
|-- config.js
|-- images/
`-- aws/
    |-- template.yaml
    `-- lambda/
        `-- orders.py
```

## Local Usage

1. Open `index.html` for the customer order page.
2. Open `admin.html` for the dashboard page.
3. Set `window.__ANIMALIA_API_URL__` in `config.js` after deploying the AWS API.

## Deploy Backend (Cheapest Serverless Stack)

Prerequisites:
- AWS CLI configured
- AWS SAM CLI installed

Deploy:

```bash
cd aws
sam build
sam deploy --guided
```

During `sam deploy --guided`:
- Set `AllowedOrigin` to your website origin (or `*` for testing).
- Set a strong `AdminToken` (you will use it in `admin.html`).

After deploy, copy output `ApiUrl`.

Then edit `config.js`:

```js
window.__ANIMALIA_API_URL__ = "https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com";
```

## Deploy Frontend (Static)

### Option A: Lowest setup cost (S3 static website endpoint, no HTTPS)

```bash
aws s3 mb s3://your-bucket-name --region us-east-1
aws s3 website s3://your-bucket-name --index-document index.html
aws s3 sync . s3://your-bucket-name --exclude "aws/*" --delete
```

### Option B: Production-friendly (S3 + CloudFront, HTTPS)

Use an S3 bucket as origin and put CloudFront in front of it.
This is still low cost and usually the best production choice.

## Automatic Deploy from GitHub

This repo includes:
- `.github/workflows/deploy-aws.yml`

On each push to `main`, it deploys backend + frontend automatically.

Setup guide:
- `aws/github-oidc-setup.md`

## Dashboard Access

- Open `admin.html`
- Paste your admin token
- Click `Connecter`
- You can search/filter orders and change status
