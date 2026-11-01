/** Fixed server-stage contract for #369. Both clients use companion-actions v1.
 * Persist a random UUID and separate random 32-byte secret before the first write.
 * Do not log this request. Only the server stores the secret hash.
 */
export type PushLocale = 'ar' | 'en' | 'es' | 'fr-CA' | 'hi' | 'pa' | 'vi';
interface InstallationProof {
  installation_id: string;
  installation_secret: string;
  expected_revision: number;
}
export type PushOperation = InstallationProof & (
  | { type: 'push.enroll'; token: string; enabled: boolean; locale: PushLocale }
  | { type: 'push.disable' | 'push.revoke' }
);
export interface PushEnrollment {
  installation_id: string;
  revision: number;
  generation: string;
  enabled: boolean;
  revoked: boolean;
  locale: PushLocale;
}
export interface PushApplyRequest {
  contract_version: 1;
  client: { platform: 'ios' | 'android'; app_version: string };
  action: 'push_apply';
  operation_id: string;
  authorization: { kind: 'ui_control' };
  operation: PushOperation;
}
export interface PushReadRequest {
  contract_version: 1;
  client: { platform: 'ios' | 'android'; app_version: string };
  action: 'push_read';
  installation_id: string;
  installation_secret: string;
}
export interface PushResolveRequest {
  contract_version: 1;
  client: { platform: 'ios' | 'android'; app_version: string };
  action: 'push_resolve';
  delivery_id: string;
  language: PushLocale;
}
export type PushTarget = { target: 'unavailable' } | { target: 'available'; task_ref: string };
export interface PushNotificationIntent {
  type: 'companion_reminder';
  delivery_id: string;
}
export interface PushApplyReply {
  status: 'applied';
  replayed: boolean;
  operation_id: string;
  results: (PushEnrollment & { type: PushOperation['type']; before_revision: number; after_revision: number })[];
  receipt: {
    operation_id: string;
    operation_type: PushOperation['type'];
    undoable: false;
    current: boolean | null;
  };
}
export type PushStatusReply = Omit<PushApplyReply, 'replayed'> |
  { status: 'pending' | 'not_applied'; operation_id: string };
