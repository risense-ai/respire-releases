# Respire releases

CLI and desktop artifact naming and packaging reference.

| Artifact | Name | Contents |
| --- | --- | --- |
| CLI | `rsrs-<rust-target>[.exe]` | Target-specific executable |
| CLI runtime | `rsrs-<rust-target>-runtime.tar.gz` | Runtime manifest, native libraries and notices |
| Core SDK | `respire-core-sdk-<rust-target>.tar.gz` | Static library, C header, manifest and licenses |
| macOS desktop | `respire-macos-<arch>.dmg` | Application and CLI resources |
| Windows desktop | `respire-windows-<arch>-setup.exe` | Application and CLI resources |
| Linux desktop | `respire-linux-<arch>.deb` / `.rpm` | Application and CLI resources |

Extract the CLI runtime archive beside the executable. Keep runtime checksums, model attribution and third-party notices with the package.

The npm launcher is `@rsrsai/cli`.

| Platform | Package | Linux libc |
| --- | --- | --- |
| Windows x64 | `@rsrsai/win-x64` | — |
| Windows ARM64 | `@rsrsai/win-arm64` | — |
| macOS ARM64 | `@rsrsai/macos-arm64` | — |
| Linux x64 | `@rsrsai/linux-x64` | musl (default) |
| Linux ARM64 | `@rsrsai/linux-arm64` | musl (default) |
| Linux x64 | `@rsrsai/linux-x64-gnu` | glibc |
| Linux ARM64 | `@rsrsai/linux-arm64-gnu` | glibc |

Use `RSRS_LIBC=glibc` or `RSRS_LIBC=musl` to select a Linux variant. Native release assets identify their libc with the Rust target suffix `-gnu` or `-musl`.

See [release assets](https://github.com/risense-ai/respire-releases/releases), [CLI](https://github.com/risense-ai/respire-cli) and [desktop client](https://github.com/risense-ai/respire-client).

## License

First-party material uses the [Respire Noncommercial License 1.0](LICENSE).
Personal noncommercial use and self-hosting are permitted. Commercial use,
including internal business deployment, requires prior written authorization.
See [commercial licensing](COMMERCIAL-LICENSE.md).
