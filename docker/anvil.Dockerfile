FROM ghcr.io/foundry-rs/foundry:latest
EXPOSE 8545
ENTRYPOINT ["anvil", "--host", "0.0.0.0", "--port", "8545", "--block-time", "5", "--state", "/data/state.json"]
