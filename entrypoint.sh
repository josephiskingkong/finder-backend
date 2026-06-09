#!/bin/sh
set -e

echo "Running prisma db push..."
npx prisma db push --accept-data-loss --schema=./prisma/schema.prisma

echo "Starting app..."
exec node dist/index.js
