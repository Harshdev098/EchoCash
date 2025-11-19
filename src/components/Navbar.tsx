import { Link } from "react-router";

export default function Navbar() {
  return (
    <header className="header">
      <div className="header-logo">
        <img src="/logo.png" alt="logo" />
      </div>
      <nav className="header-nav">
        <ul className="header-links">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About</Link></li>
          <li><Link to="/services">Services</Link></li>
          <li><a href="http://github.com/HarshDev098" target="_blank" rel="noopener noreferrer">Github</a></li>
          <li><Link to="/chat">Start Chatting</Link></li>
        </ul>
      </nav>
    </header>
  );
}
