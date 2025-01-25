import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginScreen from '../features/login/screens/Login';
import HomeScreen from '../features/home/screens/Home';

function App() {
  return (
    <BrowserRouter>
      <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/login" element={<LoginScreen/>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
