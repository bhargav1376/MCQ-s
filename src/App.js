import "./App.css";
import { Analytics } from "@vercel/analytics/react";
import Dashboard from "./Questions/Dashboard";

function App() {
  return (
    <div className="App">
      <Dashboard />
      <Analytics />
    </div>
  );
}

export default App;
