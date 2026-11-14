import { redirect } from 'next/navigation';

/** Le parrainage entre utilisateurs a été retiré (14 novembre) : les anciens liens mènent au dashboard. */
export default function ParrainageRetire() {
  redirect('/app');
}
