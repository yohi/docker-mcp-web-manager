'use client';

import { useRouter } from 'next/navigation';

export default function TestPage() {
  const router = useRouter();

  return (
    <div style={{
      padding: '20px',
      backgroundColor: 'lime',
      color: 'black',
      fontSize: '24px',
      textAlign: 'center'
    }}>
      <h1>🧪 TEST PAGE - UPDATED 🚀</h1>
      <p>If you see this page, file changes ARE working!</p>
      
      <div style={{
        margin: '20px 0',
        padding: '20px',
        backgroundColor: 'yellow',
        border: '3px solid red'
      }}>
        <button
          onClick={() => {
            alert('Test button works!');
            console.log('Test button clicked!');
          }}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          🚨 Click Me - Test Button
        </button>
        
        <button
          onClick={() => {
            console.log('Router push test');
            router.push('/dashboard');
          }}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          🏠 Go to Dashboard
        </button>
      </div>
      
      <p>Time: {new Date().toISOString()}</p>
    </div>
  );
}