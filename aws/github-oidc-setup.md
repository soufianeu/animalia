# GitHub Actions OIDC Setup (Automatic AWS Deploy)

This guide links your GitHub repo to AWS so every push to `main` deploys automatically.

Target repo:
- `soufianeu/animalia`

Workflow file:
- `.github/workflows/deploy-aws.yml`

## 1. Create the GitHub OIDC provider in AWS (one-time per account)

If not already created:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

## 2. Create an IAM role for GitHub Actions

Replace `<AWS_ACCOUNT_ID>` with your account ID.

Trust policy (`trust-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:soufianeu/animalia:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Create role:

```bash
aws iam create-role \
  --role-name animalia-github-actions-role \
  --assume-role-policy-document file://trust-policy.json
```

## 3. Attach permissions to the role

For fastest setup, attach `AdministratorAccess` first, then tighten later.

```bash
aws iam attach-role-policy \
  --role-name animalia-github-actions-role \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

## 4. Add GitHub repo secrets and variables

In GitHub repo `soufianeu/animalia`:
- Settings -> Secrets and variables -> Actions

Secrets:
- `AWS_ROLE_TO_ASSUME` = `arn:aws:iam::<AWS_ACCOUNT_ID>:role/animalia-github-actions-role`
- `ADMIN_TOKEN` = strong secret used by `admin.html`

Variables:
- `AWS_REGION` = `us-east-1` (or your region)
- `SAM_STACK_NAME` = `animalia-orders-api` (or custom)
- `S3_BUCKET` = your static website bucket name
- `ALLOWED_ORIGIN` = your frontend origin (example: `https://animalia.example.com`)
- `CLOUDFRONT_DISTRIBUTION_ID` = optional (for cache invalidation)

## 5. Push to main

Every push to `main` will:
1. Deploy/Update backend (SAM stack)
2. Read API URL from CloudFormation outputs
3. Generate `config.js` with the live API URL
4. Sync static files to S3
5. Invalidate CloudFront (if configured)
