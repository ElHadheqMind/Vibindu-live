import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
  FiCpu, FiLayers, FiZap, FiShield, FiMapPin, FiPhone, FiGlobe,
  FiArrowRight, FiActivity, FiSearch, FiMonitor, FiCode, FiServer,
  FiMousePointer, FiFilm, FiExternalLink
} from 'react-icons/fi';
import { SiGooglecloud } from 'react-icons/si';
import GrafcetAnimation from './GrafcetAnimation';
import LoginModal from './LoginModal';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../context/ThemeContext';
import { API_BASE_URL } from '../../config';

// --- Animations ---
const slideInLeft = keyframes`
  from { transform: translateX(-50px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const slideInRight = keyframes`
  from { transform: translateX(50px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

// --- Styled Components ---
const PageContainer = styled.div`
  min-height: 100vh;
  background-color: ${props => props.theme.background};
  color: ${props => props.theme.text};
  overflow-x: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
`;

const Navbar = styled.nav`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  background-color: ${props => props.theme.background}ee;
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 5%;
  z-index: 1000;
  border-bottom: 1px solid ${props => props.theme.border}40;
`;

const NavLogo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  font-weight: 800;
  color: ${props => props.theme.primary};
  cursor: pointer;

  img {
    height: 40px;
    mix-blend-mode: multiply;
  }
`;

const NavLinks = styled.div`
  display: flex;
  gap: 32px;

  @media (max-width: 968px) {
    display: none;
  }
`;

const NavLink = styled.a`
  text-decoration: none;
  color: ${props => props.theme.text};
  font-weight: 500;
  font-size: 15px;
  transition: color 0.2s;

  &:hover {
    color: ${props => props.theme.primary};
  }
`;

const LoginNavButton = styled.button`
  padding: 10px 24px;
  background-color: ${props => props.theme.primary};
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px ${props => props.theme.primary}40;
  }
`;

const HeroSection = styled.section`
  padding: 160px 5% 100px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 80vh;
  background: radial-gradient(circle at top right, ${props => props.theme.primary}05 0%, transparent 60%),
    radial-gradient(circle at bottom left, ${props => props.theme.accent}05 0%, transparent 60%);

  @media (max-width: 1024px) {
    flex-direction: column;
    text-align: center;
    padding-top: 120px;
  }
`;

const HeroContent = styled.div`
  flex: 1;
  max-width: 600px;
  animation: ${slideInLeft} 1s ease-out;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 6px 16px;
  background-color: ${props => props.theme.primary}10;
  color: ${props => props.theme.primary};
  border-radius: 50px;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 24px;
`;

const PoweredBy = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 32px;
  font-size: 15px;
  font-weight: 600;
  color: ${props => props.theme.textSecondary};

  svg {
    color: ${props => props.theme.primary};
    font-size: 18px;
  }
`;

const HeroTitle = styled.h1`
  font-size: clamp(40px, 5vw, 64px);
  line-height: 1.1;
  font-weight: 900;
  margin-bottom: 24px;
  background: linear-gradient(135deg, ${props => props.theme.text} 30%, ${props => props.theme.primary});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const HeroSubtitle = styled.p`
  font-size: 18px;
  color: ${props => props.theme.textSecondary};
  line-height: 1.6;
  margin-bottom: 40px;
`;

const HeroVisual = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  animation: ${slideInRight} 1s ease-out;
  position: relative;

  @media (max-width: 1024px) {
    margin-top: 60px;
    width: 100%;
  }
`;

const AnimationWrapper = styled.div`
  width: 100%;
  max-width: 500px;
  background: ${props => props.theme.surfaceRaised};
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 30px 60px ${props => props.theme.shadow};
  border: 1px solid ${props => props.theme.border}40;
  position: relative;
`;

const TechSection = styled.section`
  padding: 100px 5%;
  text-align: center;
  background-color: ${props => props.theme.surfaceAlt};
`;

const SectionTitle = styled.h2`
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 16px;
`;

const SectionSubtitle = styled.p`
  font-size: 18px;
  color: ${props => props.theme.textSecondary};
  max-width: 700px;
  margin: 0 auto 60px;
`;

const AgentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 60px;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
  }
`;

const AgentCard = styled.div<{ color: string }>`
  background: white;
  padding: 40px;
  border-radius: 24px;
  border: 1px solid ${props => props.theme.border}40;
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
  text-align: center;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: ${props => props.color};
  }

  &:hover {
    transform: translateY(-10px);
    box-shadow: 0 20px 40px ${props => props.color}25;
    border-color: ${props => props.color}50;
  }

  h3 {
    font-size: 22px;
    margin-bottom: 12px;
    color: #1a1a2e;
  }

  p {
    color: #666;
    line-height: 1.6;
    font-size: 15px;
  }
`;

const AgentIcon = styled.div<{ bg: string; color: string }>`
  width: 70px;
  height: 70px;
  background: ${props => props.bg};
  color: ${props => props.color};
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  margin: 0 auto 24px;
`;

const DevpostBanner = styled.div`
  background: linear-gradient(90deg, #003d73 0%, #0078d4 100%);
  color: white;
  padding: 12px 5%;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: absolute;
  top: 80px;
  left: 0;
  right: 0;
  z-index: 900;

  a {
    color: white;
    text-decoration: underline;
    display: flex;
    align-items: center;
    gap: 4px;
    
    &:hover {
      opacity: 0.9;
    }
  }
`;

const AIHighlight = styled.div`
  display: flex;
  background: linear-gradient(135deg, ${props => props.theme.primary}08, ${props => props.theme.accent}08);
  border-radius: 32px;
  padding: 60px;
  align-items: center;
  gap: 60px;
  text-align: left;
  border: 1px solid ${props => props.theme.primary}20;

  @media (max-width: 968px) {
    flex-direction: column;
    padding: 30px;
  }
`;

const AIContent = styled.div`
  flex: 1;
`;

const AIChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: white;
  border-radius: 100px;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
  margin-bottom: 30px;
  font-weight: 700;
  
  svg {
    color: #4285f4;
  }
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 30px;
  margin-top: 50px;
`;

const FeatureCard = styled.div`
  background: ${props => props.theme.surface};
  padding: 40px;
  border-radius: 20px;
  border: 1px solid ${props => props.theme.border}40;
  transition: all 0.3s;
  text-align: left;

  &:hover {
    transform: translateY(-10px);
    box-shadow: 0 20px 40px ${props => props.theme.shadow}40;
    border-color: ${props => props.theme.primary}40;
  }
`;

const FeatureIcon = styled.div`
  width: 60px;
  height: 60px;
  background: ${props => props.theme.primary}10;
  color: ${props => props.theme.primary};
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 24px;
`;

const DSLCodeBlock = styled.div`
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 24px;
  border-radius: 16px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
  text-align: left;
  border: 1px solid rgba(255,255,255,0.1);
  position: relative;
  overflow: hidden;

  &::before {
    content: 'SFC DSL';
    position: absolute;
    top: 0;
    right: 0;
    padding: 4px 12px;
    background: ${props => props.theme.primary};
    color: white;
    font-size: 10px;
    font-weight: 800;
    border-bottom-left-radius: 8px;
  }

  .keyword { color: #569cd6; }
  .string { color: #ce9178; }
  .comment { color: #6a9955; }
  .function { color: #dcdcaa; }
`;

const InputGroup = styled.div`
  margin-bottom: 20px;
`;

const Input = styled.input`
  width: 100%;
  padding: 14px 16px 14px 48px;
  border: 1.5px solid ${props => props.theme.border};
  border-radius: 12px;
  font-size: 16px;
  background: ${props => props.theme.background};
  color: #000;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.primary};
    box-shadow: 0 0 0 4px ${props => props.theme.primary}15;
  }
`;

const PrimaryButton = styled.button`
  width: 100%;
  padding: 16px;
  background: ${props => props.theme.primary};
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;

  &:hover {
    background: ${props => props.theme.primaryDark};
    transform: translateY(-2px);
    box-shadow: 0 10px 20px ${props => props.theme.primary}30;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const ContactSection = styled.section`
  padding: 100px 5%;
  background: ${props => props.theme.background};
`;

const ContactGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  max-width: 1100px;
  margin: 0 auto;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
  }
`;

const ContactInfo = styled.div``;

const ContactItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 30px;

  div.icon {
    width: 48px;
    height: 48px;
    background: ${props => props.theme.primary}10;
    color: ${props => props.theme.primary};
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }

  h4 {
    margin: 0 0 4px 0;
    font-size: 18px;
  }

  p {
    color: ${props => props.theme.textSecondary};
    margin: 0;
  }
`;

const Footer = styled.footer`
  padding: 60px 5% 30px;
  background: ${props => props.theme.surfaceAlt};
  border-top: 1px solid ${props => props.theme.border}40;
`;

const FooterMain = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 60px;
  flex-wrap: wrap;
  gap: 40px;
`;

const FooterBrand = styled.div`
  max-width: 300px;
`;

const FooterLinks = styled.div`
  display: flex;
  gap: 80px;

  @media (max-width: 600px) {
    gap: 40px;
  }
`;

const FooterCol = styled.div`
  h5 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 24px;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    margin-bottom: 12px;
  }

  a {
    text-decoration: none;
    color: ${props => props.theme.textSecondary};
    transition: color 0.2s;

    &:hover {
      color: ${props => props.theme.primary};
    }
  }
`;

const Copyright = styled.div`
  padding-top: 30px;
  border-top: 1px solid ${props => props.theme.border}40;
  text-align: center;
  font-size: 14px;
  color: ${props => props.theme.textTertiary};

  a {
    color: ${props => props.theme.primary};
    font-weight: 600;
    text-decoration: none;
  }
`;


// --- Component ---
const LoginPage: React.FC = () => {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const { theme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/welcome');
    }
  }, [isAuthenticated, navigate]);

  const openLoginModal = () => setShowLoginModal(true);
  const closeLoginModal = () => setShowLoginModal(false);


  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMsg) return;

    setIsSending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          message: contactMsg
        }),
      });

      if (response.ok) {
        setSendSuccess(true);
        setContactName('');
        setContactEmail('');
        setContactMsg('');
        setTimeout(() => setSendSuccess(false), 5000);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PageContainer>
      <Navbar>
        <NavLogo onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src="/logo.png" alt="VibIndu Logo" />
        </NavLogo>
        <NavLinks>
          <NavLink onClick={openLoginModal} style={{ cursor: 'pointer' }}>Login</NavLink>
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#gemini">Gemini 3</NavLink>
          <NavLink href="#contact">Contact</NavLink>
        </NavLinks>
        <LoginNavButton onClick={openLoginModal}>Login</LoginNavButton>
      </Navbar>

      <DevpostBanner>
        <span>Developed & Enhanced for the Gemini Live Agent Challenge</span>
        <a href="https://geminiliveagentchallenge.devpost.com/" target="_blank" rel="noopener noreferrer">
          View on Devpost <FiExternalLink size={14} />
        </a>
      </DevpostBanner>

      <HeroSection>
        <HeroContent>
          <Badge>Agentic Industrial Intelligence</Badge>
          <HeroTitle>The Industrial OS for the Agentic Era</HeroTitle>
          <HeroSubtitle>
            VibIndu is a state-of-the-art platform that leverages <strong>Gemini 3 Multimodal Agents</strong> to 
            automate industrial logic. From drawing SFCs to autonomous computer-use orchestration, 
            we're redefining industrial engineering.
          </HeroSubtitle>
          <PoweredBy>
            <SiGooglecloud /> Powered by Gemini 3 Live Agent API
          </PoweredBy>
          <PrimaryButton style={{ width: 'auto', padding: '18px 36px', fontSize: '18px' }} onClick={openLoginModal}>
            Start Vibe Coding <FiArrowRight />
          </PrimaryButton>
        </HeroContent>
        <HeroVisual>
          <AnimationWrapper>
            <GrafcetAnimation />
          </AnimationWrapper>
        </HeroVisual>
      </HeroSection>

      <TechSection style={{ background: 'white' }}>
        <SectionTitle>Meet Your Agentic Workforce</SectionTitle>
        <SectionSubtitle>
          We've built a specialized team of AI agents to handle every stage of your industrial project.
        </SectionSubtitle>

        <AgentGrid style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <AgentCard color="#00c853">
            <AgentIcon bg="#00c85315" color="#00c853"><FiCpu /></AgentIcon>
            <h3>Industrial Automation</h3>
            <p>
              The brain of the system. Orchestrates multi-agent workflows to design, verify, and compile standards-compliant SFC & GSRSM logic.
            </p>
          </AgentCard>

          <AgentCard color="#1976d2">
            <AgentIcon bg="#1976d215" color="#1976d2"><FiZap /></AgentIcon>
            <h3>Live Agent</h3>
            <p>
              Voice-activated synchronization. Listens and acts on your diagrams in real-time using Gemini 3's live multimodal capabilities.
            </p>
          </AgentCard>

          <AgentCard color="#764ba2">
            <AgentIcon bg="#764ba215" color="#764ba2"><FiMousePointer /></AgentIcon>
            <h3>Computer Use</h3>
            <p>
              Autonomous CAD control. Navigates engineering interfaces to execute low-level design tasks previously restricted to humans.
            </p>
          </AgentCard>

          <AgentCard color="#f57c00">
            <AgentIcon bg="#f57c0015" color="#f57c00"><FiFilm /></AgentIcon>
            <h3>Storyteller</h3>
            <p>
              Narrative transformation. Generates cinematic visual walkthroughs that explain complex technical logic as compelling stories.
            </p>
          </AgentCard>
        </AgentGrid>
      </TechSection>

      <TechSection id="gemini">
        <SectionTitle>Next-Gen Multimodal Intelligence</SectionTitle>
        <SectionSubtitle>
          We leverage the world's most advanced AI models to transform industrial intent into reality.
        </SectionSubtitle>

        <AIHighlight>
          <AIContent>
            <AIChip>
              <SiGooglecloud size={20} /> Gemini 3 & Agentic Logic
            </AIChip>
            <h3>Industrial Reasoning Engine</h3>
            <p>
              Our system understands complex industrial specifications using Gemini 3's deep reasoning.
              Combined with our Agentic Orchestrator, we achieve:
            </p>
            <ul style={{ paddingLeft: '20px', color: '#666', lineHeight: '2' }}>
              <li>Natural language to SFC (Sequential Function Chart) generation.</li>
              <li>Automated GSRSM logic resolution and connection.</li>
              <li>Real-time industrial diagram optimization and safety checking.</li>
            </ul>
          </AIContent>
          <div style={{ flex: 0.8, display: 'flex', justifyContent: 'center' }}>
            <FiCpu size={200} style={{ color: '#1976d2', opacity: 0.1, position: 'absolute' }} />
            <div style={{ position: 'relative', textAlign: 'center' }}>
              <FiActivity size={80} style={{ color: '#1976d2' }} />
              <div style={{ marginTop: '20px', fontWeight: 800, fontSize: '24px' }}>Logic Synthesis</div>
            </div>
          </div>
        </AIHighlight>

        <AIHighlight style={{ marginTop: '40px', background: `linear-gradient(135deg, ${theme.accent}08, ${theme.primary}08)` }}>
          <div style={{ flex: 0.8, display: 'flex', justifyContent: 'center' }}>
            <FiZap size={200} style={{ color: theme.accent, opacity: 0.1, position: 'absolute' }} />
            <div style={{ position: 'relative', textAlign: 'center' }}>
              <FiGlobe size={80} style={{ color: theme.accent }} />
              <div style={{ marginTop: '20px', fontWeight: 800, fontSize: '24px' }}>System Rendering</div>
            </div>
          </div>
          <AIContent>
            <AIChip style={{ background: 'rgba(255, 152, 0, 0.1)', color: '#f57c00' }}>
              <FiZap size={18} /> Multimodal Generation
            </AIChip>
            <h3>Advanced Visual Synthesis</h3>
            <p>
              Experience the power of state-of-the-art rendering. We've integrated the latest models for unparalleled visual and system generation:
            </p>
            <ul style={{ paddingLeft: '20px', color: '#666', lineHeight: '2' }}>
              <li><strong>Veo 3:</strong> Cinematic-quality system walkthroughs and video generation.</li>
              <li><strong>Imagen 4:</strong> Photorealistic component rendering and UI generation.</li>
              <li><strong>Nano Banana 3:</strong> High-speed industrial asset synthesis and edge-optimized visuals.</li>
            </ul>
          </AIContent>
        </AIHighlight>

        <AIHighlight style={{ marginTop: '40px' }}>
          <AIContent>
            <AIChip style={{ background: 'rgba(76, 175, 80, 0.1)', color: '#2e7d32' }}>
              <FiCode size={18} /> Proprietary SFC Language
            </AIChip>
            <h3>SFC Domain-Specific Language</h3>
            <p>
              We've developed a custom SFC DSL that makes industrial logic design faster than ever.
              Write your automation intent in human-readable code and let our server handle the complexity.
            </p>
            <ul style={{ paddingLeft: '20px', color: '#666', lineHeight: '2' }}>
              <li><strong>Instant Compilation:</strong> Turn text into complex diagrams in milliseconds.</li>
              <li><strong>Dual-SFC Generation:</strong> Automatically generates both Design and Conduct versions.</li>
              <li><strong>Server-Side Orchestration:</strong> Dedicated high-performance server for logic synthesis.</li>
            </ul>
          </AIContent>
          <div style={{ flex: 1.2 }}>
            <DSLCodeBlock>
              <div className="comment">// Define your process in seconds</div>
              <div><span className="keyword">SFC</span> <span className="string">"Production_Line"</span></div>
              <br />
              <div><span className="keyword">Step</span> 0 (<span className="function">Initial</span>) <span className="string">"Power_ON"</span></div>
              <div><span className="keyword">Transition</span> Start</div>
              <br />
              <div><span className="keyword">Step</span> 1 <span className="string">"Initialize"</span></div>
              <div>&nbsp;&nbsp;&nbsp;&nbsp;<span className="keyword">Action</span> <span className="string">"System_Check"</span></div>
              <div><span className="keyword">Transition</span> Ready</div>
              <br />
              <div><span className="keyword">Jump</span> 0</div>
            </DSLCodeBlock>
            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', color: theme.textSecondary, fontSize: '14px' }}>
              <FiServer /> High-Performance Compiler Server Active
            </div>
          </div>
        </AIHighlight>
      </TechSection>

      <section id="features" style={{ padding: '100px 5%' }}>
        <div style={{ textAlign: 'center' }}>
          <SectionTitle>Professional Automation Tools</SectionTitle>
          <SectionSubtitle>Built for engineers who want to move at the speed of thought.</SectionSubtitle>
        </div>
        <FeaturesGrid>
          <FeatureCard>
            <FeatureIcon><FiLayers /></FeatureIcon>
            <h3>SFC Visual Editor</h3>
            <p>A drag-and-drop environment to build industrial logic with zero friction. Fully standards-compliant.</p>
          </FeatureCard>
          <FeatureCard>
            <FeatureIcon><FiZap /></FeatureIcon>
            <h3>Vibe Coding Engine</h3>
            <p>Tell the agent what you want to achieve, and watch as it builds the diagram for you in real-time.</p>
          </FeatureCard>
          <FeatureCard>
            <FeatureIcon><FiActivity /></FeatureIcon>
            <h3>GSRSM Generation</h3>
            <p>The first automated generator for GSRSM. Simply define your inputs/outputs and let the AI handle the rest.</p>
          </FeatureCard>
          <FeatureCard>
            <FeatureIcon><FiMonitor /></FeatureIcon>
            <h3>Simulation Studio</h3>
            <p>Test your logic before deployment. Interactive simulation with variable tracking and step execution.</p>
          </FeatureCard>
          <FeatureCard>
            <FeatureIcon><FiShield /></FeatureIcon>
            <h3>Industrial Grade</h3>
            <p>Built with robustness in mind. Export code ready for PLCs and industrial controllers.</p>
          </FeatureCard>
          <FeatureCard>
            <FeatureIcon><FiSearch /></FeatureIcon>
            <h3>Spec Analyst</h3>
            <p>Let AI analyze your project specifications and recommend the best control strategy.</p>
          </FeatureCard>
        </FeaturesGrid>
      </section>

      <ContactSection id="contact">
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <SectionTitle>Get in Touch</SectionTitle>
          <SectionSubtitle>Have questions about integration or custom solutions? Our team is here to help.</SectionSubtitle>
        </div>
        <ContactGrid>
          <ContactInfo>
            <ContactItem>
              <div className="icon"><FiMapPin /></div>
              <div>
                <h4>Global Headquarters</h4>
                <p>El Hadheq Mind</p>
              </div>
            </ContactItem>
            <ContactItem>
              <div className="icon"><FiPhone /></div>
              <div>
                <h4>Talk to an Engineer</h4>
                <p>+216 26706183</p>
              </div>
            </ContactItem>
            <ContactItem>
              <div className="icon"><FiGlobe /></div>
              <div>
                <h4>Online Presence</h4>
                <p>www.elhadheqmind.com</p>
              </div>
            </ContactItem>
          </ContactInfo>
          <div>
            <div style={{ background: '#f8f9fa', padding: '40px', borderRadius: '24px', border: '1px solid #eee' }}>
              <h3 style={{ marginBottom: '20px' }}>Send a Message</h3>
              <form onSubmit={handleContactSubmit}>
                <InputGroup>
                  <Input
                    type="text"
                    placeholder="Your Name"
                    style={{ background: 'white' }}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                  />
                </InputGroup>
                <InputGroup>
                  <Input
                    type="email"
                    placeholder="Your Email"
                    style={{ background: 'white' }}
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                  />
                </InputGroup>
                <InputGroup>
                  <textarea
                    placeholder="How can we help you?"
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    required
                    style={{
                      width: '100%', padding: '14px', borderRadius: '12px', border: '1.5px solid #e0e0e0',
                      minHeight: '120px', fontSize: '16px', fontFamily: 'inherit', color: '#000'
                    }}
                  />
                </InputGroup>
                <PrimaryButton type="submit" disabled={isSending}>
                  {isSending ? 'Sending...' : 'Send Message'}
                </PrimaryButton>
                {sendSuccess && (
                  <div style={{ marginTop: '10px', color: '#2e7d32', fontSize: '14px', textAlign: 'center' }}>
                    Message sent successfully!
                  </div>
                )}
              </form>
            </div>
          </div>
        </ContactGrid>
      </ContactSection>

      <Footer>
        <FooterMain>
          <FooterBrand>
            <NavLogo style={{ marginBottom: '20px' }}>
              <img src="/logo.png" alt="Logo" />
            </NavLogo>
            <p style={{ color: '#777', lineHeight: '1.6' }}>
              Empowering industrial engineers with agentic AI and vibe coding.
              The future of automation is here.
            </p>
          </FooterBrand>
          <FooterLinks>
            <FooterCol>
              <h5>Platform</h5>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#gemini">Gemini 3</a></li>
                <li><a href="#">Simulation</a></li>
                <li><a href="#">Security</a></li>
              </ul>
            </FooterCol>
            <FooterCol>
              <h5>Company</h5>
              <ul>
                <li><a href="https://www.elhadheqmind.com/" target="_blank" rel="noopener noreferrer">El Hadheq Mind</a></li>
                <li><a href="https://www.elhadheqmind.com/" target="_blank" rel="noopener noreferrer">Antigravity</a></li>
                <li><a href="#">About Us</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </FooterCol>
          </FooterLinks>
        </FooterMain>
        <Copyright>
          &copy; {new Date().getFullYear()} El Hadheq Mind. Built with
          <a href="https://www.elhadheqmind.com/" target="_blank" rel="noopener noreferrer"> Antigravity</a>. All Rights Reserved.
        </Copyright>
      </Footer>

      <LoginModal isOpen={showLoginModal} onClose={closeLoginModal} />
    </PageContainer>
  );
};

export default LoginPage;
