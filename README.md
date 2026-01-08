# AI-CPA Frontend (Next.js)

This folder is designed to be pushed to its **own GitHub repo** and deployed independently.

## Local run

```bash
cd frontend
npm install

# create .env.local from env.example
npm run dev
```

Env template: `env.example`

- `NEXT_PUBLIC_API_BASE_URL` (example): `http://localhost:8000`

## Pages / UI

- `/auth`: Login + Signup (matches Streamlit auth gate)
- `/landing`: Landing page (ported from Streamlit, with added medical emoji background as requested)
- `/dashboard`: Dashboard with tabs (Patients / ADR Predictions / Explainability / Bias Audit / Workflow Efficiency)


