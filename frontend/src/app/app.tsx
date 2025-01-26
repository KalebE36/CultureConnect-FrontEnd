import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginScreen from '../features/auth/screens/Login';
import HomeScreen from '../features/home/screens/Home';
import Camera from '../features/cam/screens/Camera';
import ProtectedRoute from '../features/auth/components/ProtectedRoute';
import Profile from '../features/profile/screens/Profile';

function App() {
  return (
    <BrowserRouter>
      <Routes>
            <Route path="/" element={<ProtectedRoute><HomeScreen /></ProtectedRoute>} />
            <Route path="/login" element={<LoginScreen/>} />
            <Route path="/camera" element={<ProtectedRoute><Camera/></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile/></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
