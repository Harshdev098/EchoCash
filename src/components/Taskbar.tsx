import { useNavigate } from 'react-router'
import { useMemo } from 'react';

export default function Taskbar() {
    const navigate=useNavigate()
    const currentPath = useMemo(() => location.pathname, [location.pathname]);
    const isActive = (path: string) => currentPath === path;

    return (
        <div className='taskbar'>
            <ul className='taskbar-list'>
                <li className={`navigator-icon ${isActive('/chat') ? 'active-nav' : ''}`} onClick={()=>navigate('/chat')}><i className="fa-solid fa-compass"></i></li>
                <li className={`navigator-icon ${isActive('/chat/wallet') ? 'active-nav' : ''}`} onClick={()=>navigate('/chat/wallet')}><i className="fa-solid fa-wallet"></i></li>
                <li className={`navigator-icon ${isActive('/wallet/federation') ? 'active-nav' : ''}`}><i className="fa-solid fa-user"></i></li>
                <li className={`navigator-icon ${isActive('/wallet/federation') ? 'active-nav' : ''}`}><i className="fa-solid fa-gear"></i></li>
            </ul>
        </div>
    )
}
