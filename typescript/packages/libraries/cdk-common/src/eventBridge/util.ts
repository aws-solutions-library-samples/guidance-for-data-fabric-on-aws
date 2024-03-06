export const dfEventBusName = `DF-Shared-Bus`;
export const dfEventBusArn = (accountId: string, region: string) => `arn:aws:events:${region}:${accountId}:event-bus/${dfEventBusName}`;
export const dfSpokeEventBusName = `DF-Spoke-Shared-Bus`;
export const dfSpokeEventBusArn = (accountId: string, region: string) => `arn:aws:events:${region}:${accountId}:event-bus/${dfSpokeEventBusName}`;
