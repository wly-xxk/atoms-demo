import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BlogRoutes from './blog-routes';
import Index from './pages/Index';
import AuthCallback from './pages/AuthCallback';
import SharePage from './pages/SharePage';
import AuthError from './pages/AuthError';
// MODULE_IMPORTS_START
// MODULE_IMPORTS_END

const queryClient = new QueryClient();

const APP_TITLE = 'Atoms Demo';

const useForcedTitle = () => {
  useEffect(() => {
    const apply = () => {
      if (document.title !== APP_TITLE) document.title = APP_TITLE;
    };
    apply();
    const titleEl = document.querySelector('title');
    const observer = new MutationObserver(apply);
    if (titleEl) observer.observe(titleEl, { childList: true });
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, []);
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    {/* <Route path="/blog/*" element={<BlogRoutes />} /> */}
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/auth/error" element={<AuthError />} />
    <Route path="/s/:id" element={<SharePage />} />
    {/* MODULE_ROUTES_START */}
    {/* MODULE_ROUTES_END */}
  </Routes>
);

const App = () => {
  useForcedTitle();
  return (
  <QueryClientProvider client={queryClient}>
    {/* MODULE_PROVIDERS_START */}
    {/* MODULE_PROVIDERS_END */}
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
    {/* MODULE_PROVIDERS_CLOSE */}
  </QueryClientProvider>
  );
};

export default App;
export { AppRoutes };
