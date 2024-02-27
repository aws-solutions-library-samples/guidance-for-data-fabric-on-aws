/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { SubscriptionStatus } from "@aws-sdk/client-datazone";

export interface DataZoneSubscriptionEventDetail {
    version: string;
    metadata: {
        id: string;
        version: string;
        domain: string;
        user: string;
        awsAccountId: string;
        owningProjectId: string;
    };
    data: {
        status: SubscriptionStatus;
        subscribedListing: {
            id: string;
            ownerProjectId: string;
            version: string;
        };
        subscribedPrincipal: {
            id: string;
            type: string;
        }
        subscriptionRequestId: string;
    }
}

interface S3AssetDetail {
    type: "S3";
    assetArn: string;
}

export interface DfEventDetail extends DataZoneSubscriptionEventDetail {
    dfData: {
        assetDetail: S3AssetDetail;
        hubAccountId: string;
        spokeAccountId: string;
        subscribedProjectId: string;
        subscriptionId: string;
    }
}

export interface S3DfForm {
    arn: string;
    accountId: string;
  }
export type DfForm = S3DfForm;
