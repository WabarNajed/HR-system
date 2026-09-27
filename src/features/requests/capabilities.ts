import type { RequestAccess, RequestListRow } from './types';

/**
 * List-row action hints (quick actions in tables). Mirrors private.can_act_on_current_step and the
 * cancel rules of act_on_request using the viewer flags from get_my_request_access(). The details
 * page uses get_request_capabilities() instead; the RPC is always the final authority.
 */
export function rowCapabilities(row: RequestListRow, access: RequestAccess) {
  const pending = row.status === 'pending_manager_approval' || row.status === 'pending_hr_review';
  const own = row.requester_id === access.userId || (access.employeeId !== null && row.employee_id === access.employeeId);
  let canAct = false;
  if (pending && (!own || access.isSuperAdmin)) {
    switch (row.current_step_type) {
      case 'manager':
      case 'user':
        canAct = row.current_approver_id === access.userId;
        break;
      case 'hr':
        canAct = access.orgApprove;
        break;
      case 'role':
        canAct = Boolean(row.current_step_id && access.roleStepIds.includes(row.current_step_id));
        break;
      default:
        canAct = false;
    }
  }
  const finalStatus = row.status === 'rejected' || row.status === 'completed' || row.status === 'cancelled';
  const ownerCancellable = ['draft', 'submitted', 'pending_manager_approval', 'pending_hr_review', 'returned'].includes(row.status);
  return {
    canApprove: canAct,
    canReject: canAct,
    canReturn: canAct && (row.step?.can_return ?? true),
    canCancel: !finalStatus && ((own && ownerCancellable) || access.orgEdit),
    canEditDraft: row.status === 'draft' && row.requester_id === access.userId,
    canResubmit: row.status === 'returned' && row.requester_id === access.userId,
    canStart: row.status === 'approved' && (access.orgEdit || access.orgApprove),
    canComplete: (row.status === 'approved' || row.status === 'in_progress') && (access.orgEdit || access.orgApprove),
  };
}
