#!/usr/bin/env bash

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found!"
  exit 1
fi

echo "Migrating secrets from $ENV_FILE to fnox..."

# Read line by line
while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments and empty lines
  if [[ -z "$line" ]] || [[ "$line" == \#* ]]; then
    continue
  fi
  
  # Split into key and value at the first '='
  key="${line%%=*}"
  value="${line#*=}"
  
  # Remove surrounding quotes from value if present
  value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  
  # Expand escaped newlines
  value=$(printf '%b' "$value")
  
  # Trim whitespace from key
  key=$(echo "$key" | xargs)
  
  if [[ -n "$key" ]]; then
    echo "Setting $key..."
    fnox set -- "$key" "$value"
  fi
done < "$ENV_FILE"

echo "Migration complete! You can now test it with 'mise run dev' and safely delete $ENV_FILE."
