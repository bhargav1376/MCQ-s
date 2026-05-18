import { render, screen } from '@testing-library/react';
import App from './App';

test('renders AI MCQ Quiz dashboard', () => {
  render(<App />);
  expect(screen.getByText(/AI MCQ Quiz/i)).toBeInTheDocument();
});
