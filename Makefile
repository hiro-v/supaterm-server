.PHONY: help setup dev check release unit browser web-build hooks-install

help:
	@printf '%s\n' \
		'make setup         Bootstrap submodules, deps, and hooks via mise' \
		'make dev           Run the server in dev mode' \
		'make check         Run the default local verification bundle' \
		'make release       Build the embedded release binary' \
		'make unit          Run unit tests' \
		'make browser       Run browser tests' \
		'make web-build     Build the web bundle' \
		'make hooks-install Install checked-in git hooks'

setup:
	mise trust mise.toml
	mise install
	mise run setup

dev:
	mise run dev

check:
	mise run check

release:
	mise run release

unit:
	mise exec -- bun run test:unit

browser:
	mise exec -- bun run test:browser

web-build:
	mise exec -- bun run web:build

hooks-install:
	mise exec -- bun run hooks:install
