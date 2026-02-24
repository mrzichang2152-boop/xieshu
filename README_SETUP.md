# AI Book Writer Setup Guide

## Prerequisites

1.  **Node.js**: Ensure you have Node.js 18+ installed.
2.  **API Keys**: You need keys for:
    *   **Bocha** (Web Search)
    *   **OneBound** (WeChat Search)
    *   **OpenRouter** (LLM)

## Configuration

The project uses `.env.local` for configuration.

```bash
# .env.local

# API Keys
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000

# Bocha (Web Search)
BOCHA_API_KEY=your_bocha_key

# OneBound (WeChat Search)
ONEBOUND_API_KEY=your_onebound_key
ONEBOUND_API_SECRET=your_onebound_secret

# OpenRouter (LLM)
OPENROUTER_API_KEY=your_openrouter_key

# Proxy Configuration (CRITICAL for users in China)
# If you are in a region where OpenRouter is blocked (e.g., China),
# you MUST configure a proxy or use a VPN.
# 
# Option 1: Use a VPN (System Proxy)
# Ensure your terminal and browser use the VPN.
#
# Option 2: Set a custom Base URL (e.g., 302.ai or other relay)
# OPENROUTER_BASE_URL=https://api.302.ai/v1 
# (Note: Ensure your API Key matches the provider)
```

## Verifying Installation

### 1. Verify Search APIs
Run the search verification script to test Bocha and OneBound connectivity:

```bash
npx tsx scripts/verify-apis.ts
```

### 2. Verify Wizard Flow (LLM + Search)
Run the full wizard flow simulation. **Note: This requires a working connection to OpenRouter.**

```bash
npx tsx scripts/verify-wizard-flow.ts
```

If this fails with `403` or `Timeout`, check your Proxy/VPN settings.

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
