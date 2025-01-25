import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginScreen from '../features/login/screens/Login';
import HomeScreen from '../features/home/screens/Home';
import Camera from '../features/cam/screens/Camera';
import ProtectedRoute from '../features/auth/components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/login" element={<ProtectedRoute><LoginScreen/></ProtectedRoute>} />
            <Route path="/camera" element={<ProtectedRoute><Camera/></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
