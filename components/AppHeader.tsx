import Link from 'next/link';
import Image from 'next/image';

export default function AppHeader() {
  return (
    <header
      style={{
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'center',
        borderBottom: '1px solid #eee',
        position: 'sticky',
        top: 0,
        background: '#fff',
        zIndex: 10,
      }}
    >
      <Link href="/" aria-label="Qpick ホーム">
        <Image
          src="/qpick_logo.png"
          alt="Qpick"
          width={120}
          height={60}
          style={{ objectFit: 'contain', width: 'auto', height: '40px' }}
          priority
        />
      </Link>
    </header>
  );
}