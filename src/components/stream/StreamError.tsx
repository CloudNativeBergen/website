import { Container } from '@/components/Container';
import { BackgroundImage } from '@/components/BackgroundImage';

interface StreamErrorProps {
  title: string;
  message: string;
  children?: React.ReactNode;
}

export function StreamError({ title, message, children }: StreamErrorProps) {
  return (
    <>
      <BackgroundImage className="absolute inset-0" />
      <Container className="relative min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-space-grotesk text-4xl font-bold text-brand-slate-gray sm:text-5xl dark:text-white">
            {title}
          </h1>
          <p className="mt-4 font-inter text-lg text-gray-600 dark:text-gray-300">
            {message}
          </p>
          {children}
        </div>
      </Container>
    </>
  );
}