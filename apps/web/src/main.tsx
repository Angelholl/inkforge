import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import App from './App';
import BooksPage from './pages/BooksPage';
import NewBookPage from './pages/NewBookPage';
import BookDetailPage from './pages/BookDetailPage';
import RunPage from './pages/RunPage';
import ChapterReaderPage from './pages/ChapterReaderPage';
import DiffPage from './pages/DiffPage';
import DashboardPage from './pages/DashboardPage';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<BooksPage />} />
          <Route path="/new" element={<NewBookPage />} />
          <Route path="/books/:bookId" element={<BookDetailPage />} />
          <Route path="/books/:bookId/chapters/:chapterNo" element={<ChapterReaderPage />} />
          <Route path="/runs/:runId" element={<RunPage />} />
          <Route path="/runs/:runId/dashboard" element={<DashboardPage />} />
          <Route path="/books/:bookId/chapters/:chapterNo/diff" element={<DiffPage />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
