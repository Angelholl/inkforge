import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
// 思源宋 400（阅读正文）/600（标题品牌）两字重切片（DEC-2026-1118-02 D2；OFL 许可随包 public/fonts/）
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import App from './App';
import BooksPage from './pages/BooksPage';
import NewBookIdeaPage from './pages/NewBookIdeaPage';
import NewBookPage from './pages/NewBookPage';
import SettingsPage from './pages/SettingsPage';
import DistillPage from './pages/DistillPage';
import BookDetailPage from './pages/BookDetailPage';
import RunPage from './pages/RunPage';
import ChapterReaderPage from './pages/ChapterReaderPage';
import DiffPage from './pages/DiffPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route path="/" element={<BooksPage />} />
            <Route path="/new" element={<NewBookIdeaPage />} />
            <Route path="/continue" element={<NewBookPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/distill" element={<DistillPage />} />
            <Route path="/books/:bookId" element={<BookDetailPage />} />
            <Route path="/books/:bookId/chapters/:chapterNo" element={<ChapterReaderPage />} />
            <Route path="/books/:bookId/chapters/:chapterNo/diff" element={<DiffPage />} />
            <Route path="/runs/:runId" element={<RunPage />} />
            <Route path="/runs/:runId/dashboard" element={<DashboardPage />} />
            <Route path="/styles" element={<Navigate to="/distill" replace />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
