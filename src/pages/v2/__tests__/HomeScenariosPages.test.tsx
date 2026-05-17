import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { OperatorHomeScenariosPage } from '@/pages/v2/operator-console/HomeScenariosPage';
import { FieldHomeScenariosPage } from '@/pages/v2/field-companion/HomeScenariosPage';
import { PipelineHomeScenariosPage } from '@/pages/v2/pipeline-board/HomeScenariosPage';
import { EditorialHomeScenariosPage } from '@/pages/v2/editorial/HomeScenariosPage';
import { BharatHomeScenariosPage } from '@/pages/v2/bharat-native/HomeScenariosPage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('v2 home-scenarios pages', () => {
  it('Operator: renders all 7 scenario sections', () => {
    render(<Wrap><OperatorHomeScenariosPage /></Wrap>);
    expect(screen.getByText(/Driver · currently driving/i)).toBeInTheDocument();
    expect(screen.getByText(/Agent · 1 trip in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Agent · 3 trips in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Driver · selected for 3 trips/i)).toBeInTheDocument();
    expect(screen.getByText(/Agent · 4 applications/i)).toBeInTheDocument();
    expect(screen.getByText(/Live tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/post-assignment/i)).toBeInTheDocument();
  });

  it('Field: shows big scenario cards including live tracking', () => {
    render(<Wrap><FieldHomeScenariosPage /></Wrap>);
    expect(screen.getByText(/En route/i)).toBeInTheDocument();
    expect(screen.getAllByText(/3 trips/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Live tracking · driver moving/i)).toBeInTheDocument();
  });

  it('Pipeline: shows scenarios with column tints + stage progress', () => {
    render(<Wrap><PipelineHomeScenariosPage /></Wrap>);
    expect(screen.getByText(/Driver · currently driving/i)).toBeInTheDocument();
    expect(screen.getByText(/Live tracking · driver in motion/i)).toBeInTheDocument();
  });

  it('Editorial: shows magazine-style scenes including The dispatch · live', () => {
    render(<Wrap><EditorialHomeScenariosPage /></Wrap>);
    expect(screen.getByText(/Scenes from today/i)).toBeInTheDocument();
    expect(screen.getByText(/The dispatch · live/i)).toBeInTheDocument();
  });

  it('Bharat: bilingual scenarios with live tracking + OTP', () => {
    render(<Wrap><BharatHomeScenariosPage /></Wrap>);
    expect(screen.getByText(/காட்சிகள்/)).toBeInTheDocument();
    expect(screen.getByText(/நேரடி கண்காணிப்பு/)).toBeInTheDocument();
    expect(screen.getAllByText(/4821/).length).toBeGreaterThan(0);
  });
});
