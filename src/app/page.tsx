import { redirect } from 'next/navigation';

export default function Home() {
  // Langsung pindahkan user ke halaman kasir
  redirect('/pos');
}