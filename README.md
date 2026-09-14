# Detecto

Monorepo for the Detecto app: a Vite + React frontend and a FastAPI backend.

## Structure

```
detecto/
├── frontend/     # Vite + React (JavaScript)
├── backend/      # FastAPI
├── requirements.txt
├── .env.example
└── README.md
```

## Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r ../requirements.txt
uvicorn main:app --reload
```

API runs at http://localhost:8000  
Health check: http://localhost:8000/health

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173

## Environment

Copy `.env.example` to `.env` and adjust values as needed.
