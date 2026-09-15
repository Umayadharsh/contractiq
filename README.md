# ContractIQ Guard

Monorepo for a contract workspace with a React/Vite frontend, Express/Mongoose backend, and health-only FastAPI AI service.

## Local development

1. Copy `backend/.env.example` to `backend/.env` and set `MONGO_URI` and `JWT_SECRET`.
2. Start local MongoDB with `docker compose up -d mongodb`.
3. Install dependencies with `npm install`.
4. Start the API with `npm run dev:backend` and the frontend with `npm run dev:frontend`.
5. Start the AI health service with `python -m pip install -r ai-service/requirements.txt`, then `python -m uvicorn ai-service.main:app --reload --port 8000`.

The first registered user is the workspace Admin. Later registrations are Viewers. Admins and Reviewers can upload PDF, DOC, and DOCX files up to 10MB. Uploads are stored on local disk for development; use object storage before production because Render's filesystem is ephemeral.

## Deployment

- Import `frontend` into Vercel and set `VITE_API_URL` to the deployed Render API URL.
- Deploy the root repository with `render.yaml` or create a Render Node service with root directory `backend`.
- Set Render's `MONGO_URI` to a MongoDB Atlas connection string and `CLIENT_URL` to the Vercel URL.
- The FastAPI service is intentionally health-only for now and is not included in the Render manifest.

The hosted register/login/upload flow can only be confirmed after the Vercel and Render services are created and their URLs and MongoDB Atlas credentials are supplied.