# Quick setup checklist

- [ ] Create free Neo4j AuraDB instance at neo4j.com/cloud/aura-free, save URI + password
- [ ] cd generator && npm install && npm run generate
- [ ] cp generator/.env.example generator/.env, fill in AuraDB credentials
- [ ] cd generator && npm run load
- [ ] cp backend/.env.example backend/.env, fill in same AuraDB credentials
- [ ] cd backend && npm install && npm run dev
- [ ] cp frontend/.env.local.example frontend/.env.local
- [ ] cd frontend && npm install && npm run dev
- [ ] Open http://localhost:3000
- [ ] Click "Run Detection" — confirm rings appear
- [ ] Click "Inject Fraud Ring" then "Run Detection" again — confirm new ring is caught
- [ ] Rehearse the demo script in README.md at least 3-5 times before submission
