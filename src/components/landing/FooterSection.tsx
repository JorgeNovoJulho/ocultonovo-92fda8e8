import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

interface FooterLink {
  label: string;
  href: string;
}

interface FooterContent {
  copyright?: string;
  age_restriction?: string;
  links?: FooterLink[];
}

interface FooterSectionProps {
  content: FooterContent;
}

export function FooterSection({ content }: FooterSectionProps) {
  const links = content.links || [];

  return (
    <footer className="py-8 sm:py-12 border-t border-border/30">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
          {/* Logo & Copyright */}
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            <Logo showText={false} />
            <div className="text-center sm:text-left">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {content.copyright || '© 2025 OCULTO. Todos os direitos reservados.'}
              </p>
              {content.age_restriction && (
              <p className="text-xs text-destructive/80 font-medium">
                  {content.age_restriction}
                </p>
              )}
              <p className="text-[8px] text-muted-foreground/30 select-none">v2.0 - Vercel</p>
            </div>
          </div>
          
          {/* Links */}
          {links.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
              {links.map((link, index) => (
                <Link
                  key={index}
                  to={link.href}
                  className="text-xs sm:text-sm text-muted-foreground hover:text-[#FF007F] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
