import { describe, it } from "node:test";
import assert from "node:assert";
import { isValidBranchPrefix } from "../validation.js";

describe("isValidBranchPrefix", () => {
  it("should accept empty string", () => {
    assert.strictEqual(isValidBranchPrefix(""), true);
  });

  it("should accept valid prefixes with lowercase letters", () => {
    assert.strictEqual(isValidBranchPrefix("fleet"), true);
  });

  it("should accept valid prefixes with uppercase letters", () => {
    assert.strictEqual(isValidBranchPrefix("POTATO"), true);
  });

  it("should accept valid prefixes with numbers", () => {
    assert.strictEqual(isValidBranchPrefix("potato123"), true);
  });

  it("should accept valid prefixes with hyphens", () => {
    assert.strictEqual(isValidBranchPrefix("my-prefix"), true);
  });

  it("should accept valid prefixes with underscores", () => {
    assert.strictEqual(isValidBranchPrefix("my_prefix"), true);
  });

  it("should accept valid prefixes with forward slashes", () => {
    assert.strictEqual(isValidBranchPrefix("team/feature"), true);
  });

  it("should accept valid prefixes with mixed characters", () => {
    assert.strictEqual(isValidBranchPrefix("my-team_feature/v1"), true);
  });

  it("should reject prefixes with spaces", () => {
    assert.strictEqual(isValidBranchPrefix("my prefix"), false);
  });

  it("should reject prefixes with special characters", () => {
    assert.strictEqual(isValidBranchPrefix("my@prefix"), false);
    assert.strictEqual(isValidBranchPrefix("my#prefix"), false);
    assert.strictEqual(isValidBranchPrefix("my$prefix"), false);
    assert.strictEqual(isValidBranchPrefix("my%prefix"), false);
    assert.strictEqual(isValidBranchPrefix("my&prefix"), false);
  });

  it("should reject prefixes with dots", () => {
    assert.strictEqual(isValidBranchPrefix("my.prefix"), false);
  });

  it("should reject prefixes with brackets", () => {
    assert.strictEqual(isValidBranchPrefix("my[prefix]"), false);
    assert.strictEqual(isValidBranchPrefix("my(prefix)"), false);
  });
});
