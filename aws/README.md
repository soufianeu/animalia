# AWS Backend (Orders API)

This folder deploys:
- `POST /orders` (public): create order
- `GET /orders` (admin token required): list orders
- `PATCH /orders/{orderId}` (admin token required): update status/notes

Stack:
- API Gateway HTTP API
- Lambda (Python)
- DynamoDB (on-demand PAY_PER_REQUEST)

## Deploy

```bash
sam build
sam deploy --guided
```

## Required Parameters

- `AdminToken`: shared secret for dashboard requests (`x-admin-token`)
- `AllowedOrigin`: your frontend origin for CORS

## Output

- `ApiUrl`: set this into `../config.js`

