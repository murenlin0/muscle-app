import { redirect } from 'next/navigation';

/** 舊連結導回總管理首頁（各店客人入口已分開） */
export default function AdminClientsRedirectPage() {
  redirect('/admin');
}
