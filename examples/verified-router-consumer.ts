import { VerifiedEventRouterConsumer } from "../packages/ai-router/src/index";

const consumer = new VerifiedEventRouterConsumer();
const rawBody = process.env.KEVLAR_EVENT_BODY;
const signature = process.env.KEVLAR_SIGNATURE;
const secret = process.env.KEVLAR_WEBHOOK_SECRET;
if (!rawBody || !signature || !secret)
  throw new Error("Set the signed Kevlar webhook inputs.");

const { proposal, duplicate } = consumer.consumeSignedWebhook({
  rawBody,
  signature,
  secret,
});
if (!duplicate) {
  console.log(
    `Review required before ${proposal.action}:`,
    proposal.evidenceRefs,
  );
}
