import { redirect } from 'next/navigation';

export default function Home() {
  // Arahkan ke rute dasbor. 
  // Jika ternyata user belum login, layout.tsx dasbor akan otomatis mengembalikannya ke /login.
  redirect('/analytics'); 
}