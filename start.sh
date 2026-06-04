#!/bin/sh
# Start script to run frontend and backend via npm concurrently
set -e
cd /app
# Ensure node modules are present
npm run dev
