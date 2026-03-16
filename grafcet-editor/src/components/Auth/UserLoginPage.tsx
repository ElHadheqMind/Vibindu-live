import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { FiUser, FiLock, FiAlertCircle, FiArrowLeft } from 'react-icons/fi';
import { useAuthStore } from '../../store/useAuthStore';

// --- Animations ---
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

// --- Styled Components ---
const PageContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
`;

const LoginCard = styled.div`
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 24px;
  padding: 48px 40px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: ${fadeIn} 0.5s ease-out;
`;

const Logo = styled.div`
  text-align: center;
  margin-bottom: 32px;
  
  img {
    height: 60px;
    mix-blend-mode: multiply;
  }
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 800;
  text-align: center;
  color: #1a1a2e;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #666;
  margin-bottom: 32px;
  font-size: 15px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InputGroup = styled.div`
  position: relative;
`;

const InputIcon = styled.div`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #1976d2;
  font-size: 18px;
`;

const Input = styled.input`
  width: 100%;
  padding: 16px 16px 16px 48px;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  font-size: 16px;
  transition: all 0.2s;
  background: #fafafa;
  
  &:focus {
    outline: none;
    border-color: #1976d2;
    background: white;
    box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.1);
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(25, 118, 210, 0.3);
  }
  
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorMessage = styled.div`
  background: #ffebee;
  color: #c62828;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const BackLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 6px;
  color: #666;
  text-decoration: none;
  font-size: 14px;
  margin-top: 24px;
  justify-content: center;
  
  &:hover {
    color: #1976d2;
  }
`;

const UserLoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/welcome');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (error) clearError();
  }, [username, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <PageContainer>
      <LoginCard>
        <Logo>
          <img src="/logo.png" alt="VibIndu Logo" />
        </Logo>
        <Title>Welcome Back</Title>
        <Subtitle>Sign in with your credentials</Subtitle>
        
        {error && (
          <ErrorMessage>
            <FiAlertCircle /> {error}
          </ErrorMessage>
        )}
        
        <Form onSubmit={handleSubmit}>
          <InputGroup>
            <InputIcon><FiUser /></InputIcon>
            <Input
              type="text"
              placeholder="Username or Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </InputGroup>
          
          <InputGroup>
            <InputIcon><FiLock /></InputIcon>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </InputGroup>
          
          <SubmitButton type="submit" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </SubmitButton>
        </Form>
        
        <BackLink to="/">
          <FiArrowLeft /> Back to Home
        </BackLink>
      </LoginCard>
    </PageContainer>
  );
};

export default UserLoginPage;

