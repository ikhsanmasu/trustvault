// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TrustVaultAnchor
/// @notice Minimal on-chain registry for document integrity fingerprints.
///         Each fingerprint is a keccak256 hash of a document's binary hash
///         and text hash, stored as bytes32. Once anchored, a fingerprint
///         can never be overwritten or removed.
contract TrustVaultAnchor {
    /// @notice Maps a document fingerprint to the block timestamp when it was anchored.
    ///         Returns 0 if the fingerprint has never been anchored.
    mapping(bytes32 => uint256) public anchoredAt;

    /// @notice Emitted when a new fingerprint is anchored on-chain.
    /// @param fingerprint The document fingerprint (keccak256 of packed hashes).
    /// @param timestamp   The block.timestamp at the time of anchoring.
    /// @param sender      The address that called anchor().
    event Anchored(bytes32 indexed fingerprint, uint256 timestamp, address indexed sender);

    /// @notice Anchor a document fingerprint on-chain.
    ///         Reverts if the fingerprint has already been anchored.
    /// @param fingerprint The document fingerprint to anchor.
    function anchor(bytes32 fingerprint) external {
        require(anchoredAt[fingerprint] == 0, "Already anchored");
        anchoredAt[fingerprint] = block.timestamp;
        emit Anchored(fingerprint, block.timestamp, msg.sender);
    }

    /// @notice Verify whether a fingerprint has been anchored.
    /// @param fingerprint The document fingerprint to check.
    /// @return timestamp  The block timestamp when anchored, or 0 if not found.
    function verify(bytes32 fingerprint) external view returns (uint256) {
        return anchoredAt[fingerprint];
    }
}
