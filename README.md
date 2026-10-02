# Respire releases

CLI and desktop artifact naming and packaging reference.

| Artifact | Name | Contents |
| --- | --- | --- |
| CLI | `rsrs-<rust-target>[.exe]` | Target-specific executable |
| CLI runtime | `rsrs-<rust-target>-runtime.tar.gz` | Runtime manifest, native libraries and notices |
| macOS desktop | `respire-macos-<arch>.dmg` | Application and CLI resources |
| Windows desktop | `respire-windows-<arch>-setup.exe` | Application and CLI resources |
| Linux desktop | `respire-linux-<arch>.deb` / `.rpm` | Application and CLI resources |

Extract the CLI runtime archive beside the executable. Keep runtime checksums, model attribution and third-party notices with the package.

The npm launcher is `@rsrsai/cli`, with platform packages `@rsrsai/win-x64`, `@rsrsai/win-arm64`, `@rsrsai/macos-arm64`, `@rsrsai/linux-x64` and `@rsrsai/linux-arm64`.

See [release assets](https://github.com/risense-ai/respire-releases/releases), [CLI](https://github.com/risense-ai/respire-cli) and [desktop client](https://github.com/risense-ai/respire-client).
