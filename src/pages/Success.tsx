import { Navigate } from 'react-router-dom';

// A route visit or draft download is not proof of filing.
export default function Success() {
    return <Navigate to="/efile" replace />;
}
