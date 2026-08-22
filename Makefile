.PHONY: install dev test check build demo-reset

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

demo-reset:
	pnpm demo:reset
