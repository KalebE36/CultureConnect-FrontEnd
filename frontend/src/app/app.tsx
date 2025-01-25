import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginScreen from '../features/login/screens/Login';
import HomeScreen from '../features/home/screens/Home';
import Camera from '../features/cam/screens/Camera';

function App() {
  return (
    <BrowserRouter>
      <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/login" element={<LoginScreen/>} />
            <Route path="/camera" element={<Camera/>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
