# TrustVault — Anvil (local Ethereum node) for blockchain anchoring development
# Deploy to Railway for persistent staging Anvil instance.
#
# Build: docker build -f docker/anvil.Dockerfile -t trustvault-anvil .
# Run:   docker run -p 8545:8545 -v anvil-data:/data trustvault-anvil

FROM ghcr.io/foundry-rs/foundry:latest

# Create persistent state directory
RUN mkdir -p /data

# Expose Anvil default port
EXPOSE 8545

# Run Anvil with persistent state, block time for stable timestamps
# --host 0.0.0.0 allows connections from outside the container
# --state /data/state.json persists across restarts
# --block-time 5 creates blocks every 5 seconds for stable timestamps
ENTRYPOINT ["anvil", "--host", "0.0.0.0", "--port", "8545", "--block-time", "5", "--state", "/data/state.json"]
