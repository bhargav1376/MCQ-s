import { render, screen } from '@testing-library/react';
import App from './App';

test('renders MCQ Studio dashboard', () => {
  render(<App />);
  expect(screen.getByText(/Create Your Own MCQs/i)).toBeInTheDocument();
});
