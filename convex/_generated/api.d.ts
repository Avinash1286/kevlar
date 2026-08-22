/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as durableIncidentWorkflow from "../durableIncidentWorkflow.js";
import type * as fixtureState from "../fixtureState.js";
import type * as http from "../http.js";
import type * as idempotency from "../idempotency.js";
import type * as incidentStateMachine from "../incidentStateMachine.js";
import type * as incidents from "../incidents.js";
import type * as modelRouter from "../modelRouter.js";
import type * as phase10Admin from "../phase10Admin.js";
import type * as phase10AdminSupport from "../phase10AdminSupport.js";
import type * as phase10AuthSupport from "../phase10AuthSupport.js";
import type * as phase10Deliveries from "../phase10Deliveries.js";
import type * as phase10External from "../phase10External.js";
import type * as phase10Proof from "../phase10Proof.js";
import type * as phase10ProofSupport from "../phase10ProofSupport.js";
import type * as phase10Release from "../phase10Release.js";
import type * as phase10Support from "../phase10Support.js";
import type * as phase10Validators from "../phase10Validators.js";
import type * as phase11Access from "../phase11Access.js";
import type * as phase11Auth from "../phase11Auth.js";
import type * as phase11Operations from "../phase11Operations.js";
import type * as phase11Proof from "../phase11Proof.js";
import type * as phase11Router from "../phase11Router.js";
import type * as phase11Validators from "../phase11Validators.js";
import type * as phase12Deletion from "../phase12Deletion.js";
import type * as phase12Proof from "../phase12Proof.js";
import type * as phase12Queries from "../phase12Queries.js";
import type * as phase12Recovery from "../phase12Recovery.js";
import type * as phase12Retention from "../phase12Retention.js";
import type * as phase12Validators from "../phase12Validators.js";
import type * as phase3Scenario from "../phase3Scenario.js";
import type * as phase3Support from "../phase3Support.js";
import type * as phase3Validators from "../phase3Validators.js";
import type * as phase4Approval from "../phase4Approval.js";
import type * as phase4Auth from "../phase4Auth.js";
import type * as phase4Certification from "../phase4Certification.js";
import type * as phase4Evidence from "../phase4Evidence.js";
import type * as phase4Gauntlet from "../phase4Gauntlet.js";
import type * as phase4Heal from "../phase4Heal.js";
import type * as phase4Queries from "../phase4Queries.js";
import type * as phase4Tribunal from "../phase4Tribunal.js";
import type * as phase4Validators from "../phase4Validators.js";
import type * as phase5Auth from "../phase5Auth.js";
import type * as phase5Catalog from "../phase5Catalog.js";
import type * as phase5Certification from "../phase5Certification.js";
import type * as phase5CertificationSupport from "../phase5CertificationSupport.js";
import type * as phase5Fairness from "../phase5Fairness.js";
import type * as phase5Fleet from "../phase5Fleet.js";
import type * as phase5Ingest from "../phase5Ingest.js";
import type * as phase5IngestSupport from "../phase5IngestSupport.js";
import type * as phase5PublicRead from "../phase5PublicRead.js";
import type * as phase5Queries from "../phase5Queries.js";
import type * as phase5Validators from "../phase5Validators.js";
import type * as phase6Canonical from "../phase6Canonical.js";
import type * as phase6Identity from "../phase6Identity.js";
import type * as phase6Mappings from "../phase6Mappings.js";
import type * as phase6Proof from "../phase6Proof.js";
import type * as phase6Queries from "../phase6Queries.js";
import type * as phase6Registry from "../phase6Registry.js";
import type * as phase6Support from "../phase6Support.js";
import type * as phase6Validators from "../phase6Validators.js";
import type * as phase7Facts from "../phase7Facts.js";
import type * as phase7Proof from "../phase7Proof.js";
import type * as phase7Queries from "../phase7Queries.js";
import type * as phase7Support from "../phase7Support.js";
import type * as phase7Validators from "../phase7Validators.js";
import type * as phase8Cdc from "../phase8Cdc.js";
import type * as phase8Policies from "../phase8Policies.js";
import type * as phase8Proof from "../phase8Proof.js";
import type * as phase8Queries from "../phase8Queries.js";
import type * as phase8Support from "../phase8Support.js";
import type * as phase8Validators from "../phase8Validators.js";
import type * as phase9Evidence from "../phase9Evidence.js";
import type * as phase9Gauntlet from "../phase9Gauntlet.js";
import type * as phase9Proof from "../phase9Proof.js";
import type * as phase9Queries from "../phase9Queries.js";
import type * as phase9Repair from "../phase9Repair.js";
import type * as phase9Support from "../phase9Support.js";
import type * as phase9Validators from "../phase9Validators.js";
import type * as runs from "../runs.js";
import type * as semanticGate from "../semanticGate.js";
import type * as triage from "../triage.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  durableIncidentWorkflow: typeof durableIncidentWorkflow;
  fixtureState: typeof fixtureState;
  http: typeof http;
  idempotency: typeof idempotency;
  incidentStateMachine: typeof incidentStateMachine;
  incidents: typeof incidents;
  modelRouter: typeof modelRouter;
  phase10Admin: typeof phase10Admin;
  phase10AdminSupport: typeof phase10AdminSupport;
  phase10AuthSupport: typeof phase10AuthSupport;
  phase10Deliveries: typeof phase10Deliveries;
  phase10External: typeof phase10External;
  phase10Proof: typeof phase10Proof;
  phase10ProofSupport: typeof phase10ProofSupport;
  phase10Release: typeof phase10Release;
  phase10Support: typeof phase10Support;
  phase10Validators: typeof phase10Validators;
  phase11Access: typeof phase11Access;
  phase11Auth: typeof phase11Auth;
  phase11Operations: typeof phase11Operations;
  phase11Proof: typeof phase11Proof;
  phase11Router: typeof phase11Router;
  phase11Validators: typeof phase11Validators;
  phase12Deletion: typeof phase12Deletion;
  phase12Proof: typeof phase12Proof;
  phase12Queries: typeof phase12Queries;
  phase12Recovery: typeof phase12Recovery;
  phase12Retention: typeof phase12Retention;
  phase12Validators: typeof phase12Validators;
  phase3Scenario: typeof phase3Scenario;
  phase3Support: typeof phase3Support;
  phase3Validators: typeof phase3Validators;
  phase4Approval: typeof phase4Approval;
  phase4Auth: typeof phase4Auth;
  phase4Certification: typeof phase4Certification;
  phase4Evidence: typeof phase4Evidence;
  phase4Gauntlet: typeof phase4Gauntlet;
  phase4Heal: typeof phase4Heal;
  phase4Queries: typeof phase4Queries;
  phase4Tribunal: typeof phase4Tribunal;
  phase4Validators: typeof phase4Validators;
  phase5Auth: typeof phase5Auth;
  phase5Catalog: typeof phase5Catalog;
  phase5Certification: typeof phase5Certification;
  phase5CertificationSupport: typeof phase5CertificationSupport;
  phase5Fairness: typeof phase5Fairness;
  phase5Fleet: typeof phase5Fleet;
  phase5Ingest: typeof phase5Ingest;
  phase5IngestSupport: typeof phase5IngestSupport;
  phase5PublicRead: typeof phase5PublicRead;
  phase5Queries: typeof phase5Queries;
  phase5Validators: typeof phase5Validators;
  phase6Canonical: typeof phase6Canonical;
  phase6Identity: typeof phase6Identity;
  phase6Mappings: typeof phase6Mappings;
  phase6Proof: typeof phase6Proof;
  phase6Queries: typeof phase6Queries;
  phase6Registry: typeof phase6Registry;
  phase6Support: typeof phase6Support;
  phase6Validators: typeof phase6Validators;
  phase7Facts: typeof phase7Facts;
  phase7Proof: typeof phase7Proof;
  phase7Queries: typeof phase7Queries;
  phase7Support: typeof phase7Support;
  phase7Validators: typeof phase7Validators;
  phase8Cdc: typeof phase8Cdc;
  phase8Policies: typeof phase8Policies;
  phase8Proof: typeof phase8Proof;
  phase8Queries: typeof phase8Queries;
  phase8Support: typeof phase8Support;
  phase8Validators: typeof phase8Validators;
  phase9Evidence: typeof phase9Evidence;
  phase9Gauntlet: typeof phase9Gauntlet;
  phase9Proof: typeof phase9Proof;
  phase9Queries: typeof phase9Queries;
  phase9Repair: typeof phase9Repair;
  phase9Support: typeof phase9Support;
  phase9Validators: typeof phase9Validators;
  runs: typeof runs;
  semanticGate: typeof semanticGate;
  triage: typeof triage;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
