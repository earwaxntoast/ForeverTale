#!/bin/bash
# Cloud SQL Proxy script for ForeverTale dev database
# This script connects to the Cloud SQL instance and exposes it on localhost:5432

set -e

PROJECT_ID="forevertale-dev"
INSTANCE_CONNECTION_NAME="forevertale-dev:us-central1:forevertale-db-dev"
LOCAL_PORT="5432"

echo "Starting Cloud SQL Proxy..."
echo "Instance: $INSTANCE_CONNECTION_NAME"
echo "Local port: $LOCAL_PORT"
echo ""
echo "Connection string for .env:"
echo "DATABASE_URL=\"postgresql://forevertale:YOUR_PASSWORD@localhost:5432/forevertale?schema=public\""
echo ""
echo "Press Ctrl+C to stop the proxy"
echo "---"

# Run the proxy
# Uses Application Default Credentials (run 'gcloud auth application-default login' if needed)
cloud-sql-proxy --port=$LOCAL_PORT $INSTANCE_CONNECTION_NAME
