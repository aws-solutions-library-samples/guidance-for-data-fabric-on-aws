const roleArnFromName = (accountId: string, roleName: string) => `arn:aws:iam::${accountId}:role/${roleName}`;
const policyArnFromName = (accountId: string, policyName: string) => `arn:aws:iam::${accountId}:policy/${policyName}`;
export const credentialVendorExecutionRoleName = `DF-CredentialVendor`;
export const credentialVendorExecutionRoleArn = (accountId: string) => roleArnFromName(accountId, credentialVendorExecutionRoleName);

export const saprRoleName = (domainId: string, projectId: string) => `DF-${domainId}-${projectId}-SAPR`;
export const saprRoleArn =  (accountId: string, domainId: string, projectId: string) => roleArnFromName(accountId, saprRoleName(domainId, projectId));
export const saprRolePolicyName = (subscriptionId: string) => `Subscription-Policy-${subscriptionId}`;
export const saprPermissionsBoundaryName = `DF-SAPR-PermissionsBoundary`;
export const saprPermissionsBoundaryArn = (accountId: string) => policyArnFromName(accountId, saprPermissionsBoundaryName);

export const haprRoleName = (domainId: string, projectId: string) => `DF-${domainId}-${projectId}-HAPR`;
export const haprRoleArn =  (accountId: string, domainId: string, projectId: string) => roleArnFromName(accountId, haprRoleName(domainId, projectId));
export const haprRolePolicyName = (saprAccountId: string) => `Assume-Into-SAPR-${saprAccountId}`;
export const haprPermissionsBoundaryName = `DF-HAPR-PermissionsBoundary`;
export const haprPermissionsBoundaryArn = (accountId: string) => policyArnFromName(accountId, haprPermissionsBoundaryName);

export const eventBusHubReplicationRuleTargetRoleName = `DF-EventBusHubReplicationRuleTargetRole`;
export const eventBusHubReplicationRuleTargetRoleArn = (accountId: string) => roleArnFromName(accountId, eventBusHubReplicationRuleTargetRoleName);

export const dfEventBusName = `DF-Shared-Bus`;
export const dfEventBusArn = (accountId: string, region: string) => `arn:aws:events:${region}:${accountId}:event-bus/${dfEventBusName}`;


export const userPoolIdParameter = `/df/shared/cognito/userPoolId`;


export const hyphenateUnderscores = (name: string) => name.replaceAll("_", "-")

export enum DFEventSource {
    SUBSCRIPTION_ENRICHMENT = "df.subscriptionEnrichment"
}

export enum DFEventDetailType {
    ENRICHED_SUBSCRIPTION_CREATED = "DF Enriched Subscription Created"
}