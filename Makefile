.PHONY: install dev test check build

install:
	pnpm install

dev:
	pnpm dev

test:
	pnpm test

check:
	pnpm lint
	pnpm typecheck
	pnpm test

build:
	pnpm build
