'use client';

import { useState } from 'react';
import SearchBox from './ui/SearchBox';
import AizaView from './ui/AizaView';

export default function Home(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <main className="flex-1 flex flex-col p-5 max-w-7xl w-full mx-auto gap-4">
      <section>
        <SearchBox value={searchQuery} onChange={setSearchQuery} />
      </section>
      <section className="flex-1 flex">
        <AizaView query={searchQuery} />
      </section>
    </main>
  );
}
